This directory contains the SQL commands for the D1 database to create the appropriate tables.

To set up locally, run

```sh
cat lib/d1/*.sql | sqlite3 .bindings.local/d1/a59a375a-31e2-4aba-8821-93dff13eb195.sqlite
```