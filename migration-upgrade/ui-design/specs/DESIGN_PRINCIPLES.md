# Design principles (Direction D)

1. **Attention first.** Every primary screen answers "what do I do next?" before "how am I doing?".
2. **Next action is always visible.** It sits beside its date on the dashboard, in table rows, in the preview pane and in the detail header.
3. **Density with calm.** Tables have 44px rows, hairline borders and one accent colour. Colour carries state (overdue, due, aging), never decoration.
4. **State is never colour alone.** Stage uses pips plus a label; aging uses an icon plus a label; priority uses bars plus a label; overdue uses an icon plus text.
5. **Nothing destructive by default.** Stale detection only suggests. Archive can be restored. Hard delete is separate and asks for confirmation.
6. **One product for both roles.** A manager sees the same screens plus an Owner filter and column, a Workspace nav group and an audit notice.
7. **The workspace is always obvious.** Its name and role are in the sidebar, its colour is on the edge, and it is in the header breadcrumb.
8. **Don't hide what matters.** Tabs are used only for long-form content. Structured records stay in view.
9. **Keyboard helps, never required.** Shortcuts and ⌘K speed things up; every action is also reachable by pointer or touch.
10. **System fonts, semantic tokens, and equal care for light and dark.**
