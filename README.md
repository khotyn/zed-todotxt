# Todo.txt for Zed

Syntax highlighting for `todo.txt`, `done.txt`, and `.todotxt` files in Zed.

## Features

- Highlights active priorities like `(A)`
- Highlights completed tasks that start with `x`
- Highlights creation and completion dates in `YYYY-MM-DD` form
- Highlights projects (`+Project`), contexts (`@context`), and metadata (`key:value`)
- Shows overdue `due:YYYY-MM-DD` fields in deep red and current/future due fields in green
- Archives completed tasks to `done.txt` in the same directory without opening a terminal

The supported syntax follows the official [todo.txt format](https://github.com/todotxt/todo.txt).

## Local Installation

1. Open Zed.
2. Run `zed: extensions` from the command palette.
3. Click `Install Dev Extension`.
4. Select this directory:

   `/Users/khotyn/workspace/zed-todotxt`

If an earlier install failed while compiling the grammar, run `Install Dev Extension` again after pulling these files. Zed may have created a transient `grammars/` checkout cache inside this directory; it is ignored by git and can be deleted safely.

## Archive Completed Tasks

Open a `todo.txt`, `done.txt`, or `.todotxt` file and run the quick fix named `Archive completed todo.txt tasks`.

1. Saves the current buffer.
2. Moves lines that start with `x ` out of the current file.
3. Appends those lines to `done.txt` in the same directory.

The action is served by a small language server, so it does not open or focus a terminal pane. Zed downloads the server from this extension's GitHub release assets on first use.

## Publishing Notes

The Tree-sitter grammar is published separately at:

`https://github.com/khotyn/tree-sitter-todotxt`

The `todotxt-lsp.mjs` language server must be attached to each GitHub release as a release asset.
