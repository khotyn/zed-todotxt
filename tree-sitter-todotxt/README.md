# tree-sitter-todotxt

Tree-sitter grammar for the [todo.txt](https://github.com/todotxt/todo.txt) line format.

It recognizes:

- completed task markers (`x`)
- priorities (`(A)`)
- creation and completion dates (`YYYY-MM-DD`)
- projects (`+Project`)
- contexts (`@context`)
- metadata (`key:value`, such as `due:2026-05-22`)
