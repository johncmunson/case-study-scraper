---
name: no-use-effect
description: Direct `useEffect()` usage is banned in this project. shadcn/ui components in `@/components/ui` are allowed to use `useEffect` internally, but you should not use it in your own components. This skill offers alternative patterns for common use-cases that eliminate the need for `useEffect` in the vast majority of situations.
---

Never call `useEffect` directly. For the rare case where you need to sync with an external system on mount, there is `useMountEffect()` located in the hooks folder.

```ts
export function useMountEffect(effect: () => void | (() => void)) {
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(effect, []);
}
```

Most `useEffect` usage is compensating for something React already provides better primitives for: derived state, event handlers, and data-fetching abstractions.

`useEffect` is often added 'just in case,' but that move is the seed of the next race condition or infinite loop. Banning the hook forces the logic to be declarative and predictable.

## Compounding problems

**Brittleness:** Dependency arrays hide coupling. A refactor that seems unrelated can quietly change effect behavior.

**Infinite loops:** It is easy to create state update -> render -> effect -> state update loops, especially when dependency lists get "fixed" incrementally.

**Dependency hell:** Effect chains (A sets state that triggers B) are time-based control flow. They are hard to trace and easy to regress.

**Debugging pain:** You end up asking "why did this run?" or "why did this not run?" without a clear entrypoint like a handler.

This is not just an internal preference. Even the core React team has a full guide called "You Might Not Need an Effect". 

The problem? `useEffect` shifts code from explicit event-driven logic to implicit synchronization logic. Instead of reacting to a clear event, you are managing relationships between values and side effects through dependency arrays. 

## The solution

Below are five different patterns for varying use-cases that should eliminate the need for `useEffect`/`useMountEffect` in the vast majority of situations.

**Rule 1: derive state, do not sync it**

Most effects that set state from other state are unnecessary and add extra renders.

```ts
// ❌ BAD: Two render cycles - first stale, then filtered
function ProductList() {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);

  useEffect(() => {
    setFilteredProducts(products.filter((p) => p.inStock));
  }, [products]);
}

// ✅ GOOD: Compute inline in one render
function ProductList() {
  const [products, setProducts] = useState([]);
  const filteredProducts = products.filter((p) => p.inStock);
}
```

This pattern also creates loop hazards:

```ts
// ❌ BAD: total in deps can loop
function Cart({ subtotal }) {
  const [tax, setTax] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setTax(subtotal * 0.1);
  }, [subtotal]);

  useEffect(() => {
    setTotal(subtotal + tax);
  }, [subtotal, tax, total]);
}

// ✅ GOOD: No effects required
function Cart({ subtotal }) {
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
}
```

Smell test:

- You are about to write `useEffect(() => setX(deriveFromY(y)), [y])`
- You have state that only mirrors other state or props

**Rule 2: use data-fetching libraries**

Effect-based fetching often creates race conditions and duplicated caching logic.

```ts
// ❌ BAD: Race condition risk
function ProductPage({ productId }) {
  const [product, setProduct] = useState(null);

  useEffect(() => {
    fetchProduct(productId).then(setProduct);
  }, [productId]);
}

// ✅ GOOD: Query library such as Tanstack Query or SWR handles cancellation/caching/staleness
function ProductPage({ productId }) {
  const { data: product } = useQuery(['product', productId], () =>
    fetchProduct(productId)
  );
}
```

Smell test:

- Your effect does `fetch(...)` and then `setState(...)`
- You are re-implementing caching, retries, cancellation, or stale handling

**Rule 3: event handlers, not effects**

If a user clicks a button, do the work in the handler.

```ts
// ❌ BAD: Effect as an action relay
function LikeButton() {
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (liked) {
      postLike();
      setLiked(false);
    }
  }, [liked]);

  return <button onClick={() => setLiked(true)}>Like</button>;
}

// ✅ GOOD: Direct event-driven action
function LikeButton() {
  return <button onClick={() => postLike()}>Like</button>;
}
```

Smell test:

- State is used as a flag so an effect can do the real action
- You are building "set flag -> effect runs -> reset flag" mechanics

**Rule 4: useMountEffect for one-time external sync**

`useMountEffect` is just `useEffect(..., [])` wrapped in a named hook to make intent explicit and prevent ad-hoc effect usage in components.

```ts
function useMountEffect(callback: () => void | (() => void)) {
  useEffect(callback, []);
}
```

Good uses:

- DOM integration (focus, scroll)
- Third-party widget lifecycles
- Browser API subscriptions

A useful pattern is conditional mounting.

```ts
// ❌ BAD: Guard inside effect
function VideoPlayer({ isLoading }) {
  useEffect(() => {
    if (!isLoading) playVideo();
  }, [isLoading]);
}

// ✅ GOOD: Mount only when preconditions are met
function VideoPlayerWrapper({ isLoading }) {
  if (isLoading) return <LoadingScreen />;
  return <VideoPlayer />;
}

function VideoPlayer() {
  useMountEffect(() => playVideo());
}

// ✅ ALSO GOOD: Persistent shell + conditional instance
function VideoPlayerInstance() {
  useMountEffect(() => playVideo());
}

function VideoPlayerContainer({ isLoading }) {
  return (
    <>
      <VideoPlayerShell isLoading={isLoading} />
      {!isLoading && <VideoPlayerInstance />}
    </>
  );
}
```

Smell test:

- You are synchronizing with an external system
- The behavior is naturally "setup on mount, cleanup on unmount"

**Rule 5: reset with key, not dependency choreography**

```ts
// ❌ BAD: Effect attempts to emulate remount behavior
function VideoPlayer({ videoId }) {
  useEffect(() => {
    loadVideo(videoId);
  }, [videoId]);
}

// ✅ GOOD: key forces clean remount
function VideoPlayer({ videoId }) {
  useMountEffect(() => {
    loadVideo(videoId);
  });
}

function VideoPlayerWrapper({ videoId }) {
  return <VideoPlayer key={videoId} videoId={videoId} />;
}
```

If the requirement is "start fresh when ID changes," use React's remount semantics directly.

Smell test:

- You are writing an effect whose only job is to reset local state when an ID/prop changes
- You want the component to behave like a brand-new instance for each entity

## Forcing function for nesting

Banning direct `useEffect` works as a forcing function for cleaner tree design. Parents own orchestration and lifecycle boundaries. Children can assume preconditions are already met. You get simpler components and fewer hidden side effects.

This is basically Unix philosophy applied to React components: each unit does one job, and coordination happens at clear boundaries.

## Choose your bug

No complex React frontend codebase is free of bugs. The question is which failure mode you want.

`useMountEffect` failures are usually binary and loud (it ran once, or not at all). Direct `useEffect` failures often degrade gradually and show up as flaky behavior, performance issues, or loops before a hard failure.

| useMountEffect bugs | ✅ Correct behavior | useEffect bugs |
|---|---|---|
| ◯ `0 calls` | ◯ `1 call` | ◯ `2+ ... ∞` |
| **OBVIOUS BUG** | **CORRECT BEHAVIOR** | **SUBTLE → CRASH** |
| Feature never initializes. Error state is immediate. | Stable mount, deterministic logic. | Race conditions, memory leaks, or infinite loops. |

### Left Side Risks

When using custom mount abstractions, the risk is **failing to trigger**. This is often caused by conditional rendering or dependencies that never resolve. While frustrating, it's easy to catch in dev.

### Right Side Risks

Native `useEffect` often suffers from **over-triggering**. Missing dependency arrays or state updates within the effect cause expensive re-renders or infinite loops that "leak" into production.
