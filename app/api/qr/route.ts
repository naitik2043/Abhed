import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

/** QR codes for approval links, so any company site can show them without a QR library. */
export async function GET(req: Request) {
  const text = (new URL(req.url).searchParams.get('text') ?? '').slice(0, 300);
  if (!/^https:\/\/|^http:\/\/localhost/.test(text)) return new Response('text must be a URL', { status: 400 });
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400', 'access-control-allow-origin': '*' } });
}
