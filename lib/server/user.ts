import md5 from "blueimp-md5";

export const toUiUser = ({ email, ...user }: User): UiUser => ({
  ...user,
  gravatarId: md5(email),
});
