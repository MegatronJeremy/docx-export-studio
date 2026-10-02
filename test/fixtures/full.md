---
title: Frontmatter must not appear
tags: [test]
---
# Project Report

Intro with **bold**, *italic*, ***both***, ~~strike~~, ==highlight==, `inline code`, a [web link](https://example.com/page) and a [[Other Note|wikilink alias]].

%% hidden comment %%

## Lists

- First bullet
  - Nested bullet
    - Third level
- Second bullet

1. Step one
2. Step two
   1. Sub step

- [ ] open task
- [x] done task

## Table

| Name | Qty | Price |
|:-----|:---:|------:|
| Apple | 3 | 1.50 |
| Pear with `code` | 10 | 22.00 |

## Code

```ts
function hello(name: string) {
  return `hi ${name}`;
}
```

> [!warning] Careful
> This is a **callout** body.
> - with a list item

> [!note]
> Default title callout.

> A plain quote line.

---

![[pixel.png|200]]

![missing](nothere.png)

Final paragraph UNIQUE_END_MARKER.
