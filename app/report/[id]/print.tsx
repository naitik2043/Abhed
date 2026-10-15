'use client';

export function PrintButton() {
  return (
    <button className="rp-print" onClick={() => window.print()}>
      Download PDF
    </button>
  );
}
