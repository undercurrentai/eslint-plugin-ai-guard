# require-authz-check

> ⚠️ **Deprecated in v2.0.0-beta.2.** This rule is replaced by [`require-framework-authz`](./require-framework-authz.md), which adds CASL, Casbin, Cerbos, and Permit.io detection with import-verified pattern matching. This rule continues to emit findings with a `[ai-guard deprecated — use require-framework-authz]` message prefix. **It will be removed in v3.0.0.**
>
> To silence just this rule while keeping other ai-guard rules, add the [`compat` preset](../guides/compat-config.md) to your flat config or set it to `'off'` explicitly.

**Category:** Security | **Status:** Deprecated (will be removed in v3.0.0)

---

## What it does

Flags route handlers that access resource identifiers from `req.params` (like `req.params.id`) without a visible ownership or authorization check — i.e., without verifying that the authenticated user has permission to access that specific resource.

## Why it matters

Authentication ("are you logged in?") and authorization ("do you own this resource?") are two separate checks. After adding auth middleware, many AI-generated handlers pass the authentication check but then retrieve and return *any* resource by ID without verifying it belongs to the requesting user.

This is the **Broken Object-Level Authorization (BOLA)** vulnerability — OWASP API Security Top 10 #1. An authenticated user can access any other user's data by simply changing the ID in the request.

## ❌ Bad Example

```typescript
// Authenticated, but no ownership check
router.get('/orders/:id', authenticate, async (req, res) => {
  const order = await Order.findById(req.params.id); // ← any user can read any order
  res.json(order);
});

// Deletes any user's resource without checking ownership
router.delete('/posts/:id', requireAuth, async (req, res) => {
  await Post.deleteById(req.params.id); // ← no check that req.user owns this post
  res.json({ success: true });
});
```

## ✅ Good Example

```typescript
// Check that the resource belongs to the authenticated user
router.get('/orders/:id', authenticate, async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.id,
    userId: req.user.id, // ← ownership check in the query
  });
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json(order);
});

// Explicit ownership check after fetch
router.delete('/posts/:id', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post || post.authorId !== req.user.id) { // ← explicit ownership check
    return res.status(403).json({ error: 'Forbidden' });
  }
  await post.delete();
  res.json({ success: true });
});
```

## How to fix

After fetching a resource by ID from request params, verify that `resource.ownerId === req.user.id` (or equivalent). Return 403 or 404 if the check fails. Include the ownership constraint directly in your database query when possible.
