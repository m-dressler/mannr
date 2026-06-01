import { getUserInfo } from "@lib/client/getUserInfo.ts";
import { replaceProfilePicture } from "@lib/client/replaceProfilePicture.ts";
import { hasRole } from "@lib/common/roles.ts";
import { HTMLTemplater, type TemplateElementMapper } from "@md/html-templater";
import onDomReady from "@md/on-dom-ready";
import fuzzysort from "fuzzysort";
import { UserInfo } from "../../me/+fn.ts";
import BANK_METADATA_RAW from "../../meta.json" with { type: "json" };

/** Adds standard transactions from {@link BANK_METADATA_RAW} to select elements and handles mode toggle */
onDomReady(async () => {
  const { standardTransactions } = BANK_METADATA_RAW as unknown as BankMetadata;

  /** List of transactions sorted by absolute value */
  const transactionList = Object.entries(standardTransactions).map((
    [id, [name, delta]],
  ) => ({ id, name, delta }));
  // Sort by absolute delta value
  transactionList.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));

  const transactionToTemplateMapper = (
    { id, name, delta }: typeof transactionList[number],
  ): TemplateElementMapper => ({
    input: { value: `id:${id}` },
    span: { textContent: name },
    em: { textContent: (v: string) => `${delta} ${v}` },
  });

  new HTMLTemplater("#send-mps-option-container template").instantiate(
    transactionList.filter((v) => v.delta > 0).map(transactionToTemplateMapper),
  );

  new HTMLTemplater("#revoke-mps-option-container template").instantiate(
    transactionList.filter((v) => v.delta < 0).map(transactionToTemplateMapper),
  );

  for (const id of ["send-mps-modal", "revoke-mps-modal"]) {
    const modal = document.getElementById(id)!;
    const searchInput = modal.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    const olElement = modal.querySelector<HTMLOListElement>("ol")!;
    const lis = Array.from(olElement.querySelectorAll("li"));

    // Handle search
    searchInput.addEventListener("input", () => {
      const search = searchInput.value;
      const sorted = fuzzysort.go(search, lis, {
        key: "textContent",
        all: true,
      });
      // Remove all
      for (const li of lis) li.remove();
      // Insert in order
      for (const { obj } of sorted) olElement.appendChild(obj);
    });

    // Handle custom/standard transaction
    const customInputs = modal.querySelectorAll<HTMLInputElement>(
      'input[type=text][name="reason"],[name="delta"]',
    );
    // Clear custom values on standard select
    olElement.addEventListener(
      "input",
      () => customInputs.forEach((e) => e.value = ""),
    );
    // Clear standard select on custom values
    customInputs.forEach((e) =>
      e.addEventListener("input", () => {
        const checked = olElement.querySelector<HTMLInputElement>(
          "input:checked",
        );
        if (checked) checked.checked = false;
      })
    );
  }

  // Handle balance display and create button visibility
  const userInfo = await getUserInfo();

  const getElByDatatype = <E extends Element = Element>(dataType: string) =>
    document.querySelector<E>(`[data-type=${dataType}]`);

  const createBtn = getElByDatatype<HTMLButtonElement>("create-btn")!;
  const transferBtn = getElByDatatype<HTMLButtonElement>("transfer-btn")!;
  const modeInput = getElByDatatype<HTMLInputElement>("mode-input")!;

  // Check if viewing own profile (extract userId from URL path)
  const pathMatch = location.pathname.match(/\/bank\/users\/(\d+)/);
  const profileUserId = Number(pathMatch?.[1]);
  const isOwnProfile = profileUserId === userInfo.userId;

  // Show create button if user has create_mt role
  if (hasRole(userInfo.roles, "create_mt")) {
    createBtn.style.display = "inline-block";
  }

  // Hide transfer buttons if viewing own profile (can't transfer to yourself)
  if (isOwnProfile) transferBtn.style.display = "none";

  // Set mode when buttons are clicked
  createBtn.addEventListener("click", () => modeInput.value = "create");
  transferBtn.addEventListener("click", () => modeInput.value = "transfer");

  // Handle form responses to update UI without reload
  const handleFormResponse = (e: Event) => {
    if (!(e instanceof CustomEvent)) return;
    const { success, data: transaction } = e.detail as {
      success: boolean;
      data: Transaction;
    };

    if (!success || !transaction) return;

    const form = e.target as HTMLFormElement;
    form.reset();
    form.closest("dialog")?.close();

    // Update MPs balance — only if transaction is immediately active
    const mpsBalanceEl = document.getElementById("mps-balance");
    if (transaction.status === "active" && mpsBalanceEl) {
      const currentBalanceText =
        mpsBalanceEl.textContent?.match(/[\d,]+/)?.[0] || "0";
      const currentBalance = parseInt(currentBalanceText.replace(/,/g, ""), 10);
      const newBalance = currentBalance + transaction.delta;
      const formattedBalance = new Intl.NumberFormat().format(newBalance);

      // Preserve the {mps} suffix by updating just the number part
      mpsBalanceEl.textContent = mpsBalanceEl.textContent?.replace(
        /[\d,]+/,
        formattedBalance,
      ) || `${formattedBalance} mps`;
    }

    // Add new transaction with metadata
    const transactionWithMeta = {
      ...transaction,
      creator_name: userInfo.email, // Current user created it
      vouch_count: 0, // New transactions always have 0 vouches
    };
    createTransactionElement(transactionWithMeta, userInfo, true);
  };

  document.querySelectorAll("#send-mps-form, #revoke-mps-modal form").forEach(
    (form) => form.addEventListener("form-response", handleFormResponse),
  );

  type TransactionData = Transaction & {
    vouch_count: number;
    creator_name: string;
    sender_name?: string | null;
    recipient_name?: string;
    direction?: "incoming" | "outgoing";
  };

  // ########################################################
  // # Load transaction history loader with infinite scroll #
  // ########################################################

  const container = document.getElementById("transactions-list");
  if (!container) return;

  const BANK_METADATA = BANK_METADATA_RAW as unknown as BankMetadata;

  let offset = 0;
  const limit = 20;
  let loading = false;
  let hasMore = true;

  const userInfoPromise = getUserInfo();

  /** Format Unix timestamp to localized date string */
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /**
   * Get readable reason text from transaction
   */
  const getReasonText = (transaction: TransactionData): string => {
    if (transaction.reason.startsWith("id:")) {
      const id = transaction.reason.substring(3);
      const stdTransaction = BANK_METADATA.standardTransactions[id];
      return stdTransaction ? stdTransaction[0] : transaction.reason;
    }
    return transaction.reason;
  };

  const transactionTemplater = new HTMLTemplater(
    "#transaction-template",
  );

  /** Create transaction list item from template */
  const createTransactionElement = (
    transaction: TransactionData,
    userInfo: UserInfo,
    prepend = false,
  ): void => {
    const currentUserId = userInfo.userId;
    const canVouch = hasRole(userInfo.roles, "vouch_mt") &&
      transaction.recipient_user_id !== currentUserId &&
      transaction.created_by_user_id !== currentUserId &&
      transaction.sender_user_id !== currentUserId;
    const canRevoke = hasRole(userInfo.roles, "revoke_transaction") &&
      transaction.status !== "revoked";

    // Handle actions
    const canVouchThis = canVouch && transaction.status === "pending";

    // Outgoing transfers debit the viewed user — flip sign for display
    const displayDelta = transaction.direction === "outgoing"
      ? -transaction.delta
      : transaction.delta;

    const toSlots = (map: TemplateElementMapper): TemplateElementMapper =>
      Object.fromEntries(
        Object.entries(map).map(([k, v]) => [`[data-slot="${k}"]`, v]),
      );

    transactionTemplater.instantiate(
      toSlots({
        date: { textContent: formatDate(transaction.created_at) },
        "status-badge": { classList: [`badge-${transaction.status}`] },
        "status-text": transaction.status.toUpperCase() +
          (transaction.status === "pending"
            ? ` (${transaction.vouch_count}/${transaction.required_vouches})`
            : ""),
        reason: getReasonText(transaction),
        creator: transaction.creator_name,
        delta: {
          classList: [`text-${displayDelta >= 0 ? "green" : "red"}-500`],
          textContent: `${displayDelta >= 0 ? "+" : ""}${
            new Intl.NumberFormat().format(displayDelta)
          } MPs`,
        },
        // Remove actions if nothing can be done
        ...(!canVouchThis && !canRevoke && { actions: null }),
        "btn-vouch": canVouchThis ? { "data-id": transaction.id + "" } : null,
        "btn-revoke": canRevoke ? { "data-id": transaction.id + "" } : null,
      }),
    );

    // Prepend to list if requested
    if (prepend) {
      const container = document.getElementById("transactions-list");
      const newElement = transactionTemplater.instances.at(-1) as HTMLElement;
      if (container && newElement) {
        container.insertBefore(newElement, container.firstChild);
      }
    }
  };

  /** Load transactions from API */
  const loadTransactions = async (): Promise<void> => {
    if (loading || !hasMore) return;

    loading = true;
    const loadingEl = document.getElementById("transactions-loading");

    if (loadingEl) loadingEl.style.display = "block";

    try {
      const response = await fetch(
        location.pathname.replace(/\/+$/, "") +
          `/transactions?limit=${limit}&offset=${offset}`,
      );
      const transactions: TransactionData[] = await response.json();

      if (transactions.length < limit) {
        hasMore = false;
      }

      const userInfo = await userInfoPromise;
      for (const transaction of transactions) {
        createTransactionElement(transaction, userInfo);
      }

      offset += transactions.length;
    } catch (error) {
      console.error("Failed to load transactions:", error);
    } finally {
      loading = false;
      if (loadingEl) loadingEl.style.display = "none";
    }
  };

  /** Handle vouch button click */
  const handleVouch = async (transactionId: number): Promise<void> => {
    try {
      const response = await fetch(
        `/bank/transactions/${transactionId}/vouch`,
        {
          method: "POST",
        },
      );

      // Reload transactions
      if (response.ok) location.reload();
      else {
        const error = await response.json<{ message?: string }>();
        console.error(error);
        alert(error.message || "Failed to vouch for transaction");
      }
    } catch (error) {
      console.error("Vouch error:", error);
      alert("Failed to vouch for transaction");
    }
  };

  /** Handle revoke button click */
  const handleRevoke = async (transactionId: number): Promise<void> => {
    const reason = prompt("Reason for revocation (optional):");
    if (reason === null) return; // User cancelled

    try {
      const formData = new FormData();
      if (reason) formData.append("reason", reason);

      const response = await fetch(
        `/bank/transactions/${transactionId}/revoke`,
        { method: "POST", body: formData },
      );

      if (response.ok) {
        // Reload transactions
        location.reload();
      } else {
        const error = await response.json<{ message?: string }>();
        alert(error.message || "Failed to revoke transaction");
      }
    } catch (error) {
      console.error("Revoke error:", error);
      alert("Failed to revoke transaction");
    }
  };

  // Load initial transactions
  loadTransactions();

  // Infinite scroll
  const sentinel = document.getElementById("transactions-sentinel");
  if (sentinel) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadTransactions();
    });
    observer.observe(sentinel);
  }

  // Event delegation for vouch/revoke buttons
  container.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    const buttonType = target.getAttribute("data-slot");
    if (buttonType === "btn-vouch") {
      const id = parseInt(target.getAttribute("data-id") || "0", 10);
      if (id) handleVouch(id);
    } else if (buttonType === "btn-revoke") {
      const id = parseInt(target.getAttribute("data-id") || "0", 10);
      if (id) handleRevoke(id);
    }
  });
});

replaceProfilePicture();
