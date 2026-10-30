# Online play branch

Branch: codex/online-play. Preserve main's GitHub Pages deployment and local testing.

Invite-only two-player rooms without accounts. Host creates a match, shares a one-use invitation, guest joins. Each browser retains a separate private seat credential. Server alone chooses the shuffle and validates moves. Return only that seat's view; never send an opponent's hand, deck order, full replay or credential. Durable storage retains pending decisions for live and correspondence play. Poll updates every two seconds while visible; resume by reopening the room in the same browser. Fixed player viewpoint online. Undo is immediate for the player who took the most recent actions. It remains available after End turn until the opponent’s first accepted action. The closed window never reopens when the opponent undoes their action.

Worker + SQLite Durable Object per match; bundled frontend assets. Keep local pure rules, validation and undo/replay compatible. No notifications, accounts, matchmaking or chat in this first online version.

Verify server authentication, one-use join, hidden data, stale revisions, duplicate retries, rejection atomicity, persistence/reload, all phase permissions, undo negotiation. Verify two browser seats and reload/resume, local mode regression, phone layout. Deploy only the new online Worker, leaving main's Pages site intact.
