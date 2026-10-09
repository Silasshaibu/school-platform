export default function Done() {
  return (
    <div className="mx-auto mt-6 max-w-sm space-y-3">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Payment received</h1>
      <p>We're confirming it with your bank. Your balance updates within a minute or two, and your receipt follows.</p>
      <a href="/parent" className="inline-block rounded-lg bg-[var(--brand)] px-4 py-3 font-medium text-white">Back to fees</a>
    </div>
  );
}
