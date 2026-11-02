export default function BillingCancelPage() {
  return (
    <div className="min-h-screen bg-[#f4f1e6] px-4 py-12 text-[#183c37]">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-[#d9d3c5] bg-[#faf7ee] p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#f2e2d7] text-[#8f4e3b]">
          <span className="text-3xl font-black">!</span>
        </div>

        <h1 className="font-display text-3xl font-black">Payment cancelled</h1>
        <p className="mt-3 text-sm leading-7 text-[#5a736d]">
          The payment was cancelled or did not complete. You can try again at any time.
        </p>

        <a
          href="/billing"
          className="mt-6 inline-flex rounded-full bg-[#205c50] px-5 py-3 text-sm font-bold text-white"
        >
          Try again
        </a>
      </div>
    </div>
  );
}
