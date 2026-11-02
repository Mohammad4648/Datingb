export default function BillingSuccessPage() {
  return (
    <div className="min-h-screen bg-[#f4f1e6] px-4 py-12 text-[#183c37]">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-[#d9d3c5] bg-[#faf7ee] p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#dfe9d8] text-[#205c50]">
          <span className="text-3xl font-black">✓</span>
        </div>

        <h1 className="font-display text-3xl font-black">Payment successful</h1>
        <p className="mt-3 text-sm leading-7 text-[#5a736d]">
          Your subscription was submitted successfully. The billing system will confirm the payment and activate your plan.
        </p>

        <a
          href="/"
          className="mt-6 inline-flex rounded-full bg-[#205c50] px-5 py-3 text-sm font-bold text-white"
        >
          Back to home
        </a>
      </div>
    </div>
  );
}
