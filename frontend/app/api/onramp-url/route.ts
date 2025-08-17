// app/api/onramp-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const runtime = 'nodejs';

const CDP_API_KEY_NAME = process.env.CDP_API_KEY_NAME!;   // organizations/{org}/apiKeys/{key}
const RAW_SECRET = process.env.CDP_API_KEY_SECRET!;        // PEM EC private key
const CDP_BASE_URL = 'https://api.developer.coinbase.com';

// normalize PEM newlines if stored with "\n"
const CDP_API_KEY_SECRET = RAW_SECRET.includes('\\n')
  ? RAW_SECRET.replace(/\\n/g, '\n')
  : RAW_SECRET;

// JWT per Coinbase Onramp spec for the Session Token API
function signOnrampJWTFor(path: string) {
  const nbf = Math.floor(Date.now() / 1000);
  const exp = nbf + 120;
  const uri = `POST api.developer.coinbase.com${path}`;
  const payload = { iss: 'cdp', sub: CDP_API_KEY_NAME, nbf, exp, uri };

  return jwt.sign(payload, CDP_API_KEY_SECRET, {
    algorithm: 'ES256',
    header: {
      alg: 'ES256',
      typ: 'JWT',
      kid: CDP_API_KEY_NAME,
      nonce: crypto.randomBytes(16).toString('hex'),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      destination_address,
      network = 'base',         // purchases must be on mainnets
      asset = 'USDC',           // what they’re buying
      paymentAmount = '25.00',  // $ amount to prefill
      paymentCurrency = 'USD',
    } = body;

    if (!destination_address) {
      return NextResponse.json({ error: 'destination_address required' }, { status: 400 });
    }

    // 1) Create a session token that ONLY allows buying USDC to the given address on Base
    const tokenPath = '/onramp/v1/token';
    const jwtBearer = signOnrampJWTFor(tokenPath);

    const sessionRes = await fetch(`${CDP_BASE_URL}${tokenPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwtBearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        addresses: [{ address: destination_address, blockchains: [network] }],
        assets: [String(asset).toUpperCase()], // single asset to avoid ambiguity
      }),
    });

    if (!sessionRes.ok) {
      const text = await sessionRes.text().catch(() => '');
      console.error('session-token error', sessionRes.status, text);
      return NextResponse.json(
        { error: `session-token failed (${sessionRes.status}): ${text}` },
        { status: 500 }
      );
    }

    const { token: sessionToken } = await sessionRes.json();

    // 2) Build a BUY URL (not send), explicitly forcing the buy experience
    // Required/Useful params per docs:
    // - sessionToken
    // - presetFiatAmount + fiatCurrency
    // - defaultAsset (can omit if session token has single asset, but we set it explicitly)
    // - defaultNetwork
    // - defaultExperience=buy to force the Buy UI
    const params = new URLSearchParams({
      sessionToken,
      presetFiatAmount: String(paymentAmount),
      fiatCurrency: String(paymentCurrency).toUpperCase(),
      defaultAsset: String(asset).toUpperCase(),
      defaultNetwork: network,
      defaultExperience: 'buy',
      defaultPaymentMethod: 'CARD', // optional hint
    });

    const onramp_url = `https://pay.coinbase.com/buy?${params.toString()}`;
    return NextResponse.json({ onramp_url });
  } catch (e: any) {
    console.error('onramp-url route error', e);
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
