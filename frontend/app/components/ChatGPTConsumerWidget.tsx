'use client';

import { useEffect, useMemo, useState } from 'react';
import { encodeFunctionData, createPublicClient, http } from 'viem';

// === Coinbase Embedded hooks ===
import { useSignEvmTransaction } from '@coinbase/cdp-hooks';
import { useEvmAddress } from '@coinbase/cdp-hooks';

// If you're on Fuji:
const DEFAULT_CHAIN = {
  id: 43113,
  name: 'Avalanche Fuji',
  nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
  rpcUrls: { default: { http: [] as string[] } },
};

// --- Minimal ABI for your functions ---
const CHATGPT_CONSUMER_ABI = [
  {
    type: 'function',
    name: 'askQuestion',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'subscriptionId', type: 'uint64' },
      { name: 'question', type: 'string' },
    ],
    outputs: [{ name: 'requestId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'lastAnswer',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'getLastError',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
] as const;

// --- Simple JSON-RPC helpers ---
async function rpc<T>(rpcUrl: string, method: string, params: any[] = []): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'RPC error');
  return json.result as T;
}

// formatting + balance helpers
function formatAvax(wei: bigint) {
  const s = wei.toString().padStart(19, '0');
  const whole = s.slice(0, -18) || '0';
  const frac = s.slice(-18).replace(/0+$/, '');
  return frac ? `${whole}.${frac} AVAX` : `${whole} AVAX`;
}
async function getBalance(rpcUrl: string, address: string): Promise<bigint> {
  const balHex = await rpc<string>(rpcUrl, 'eth_getBalance', [address, 'latest']);
  return BigInt(balHex);
}

type Props = {
  contractAddress: `0x${string}`;
  rpcUrl: string;             // e.g. https://api.avax-test.network/ext/bc/C/rpc
  chainId?: bigint;           // bigint
  defaultSubscriptionId?: bigint;

  // Programmatic submission from parent
  externalQuestion?: string;          // question to submit (from page)
  externalSubscriptionId?: bigint;    // optional override sub id (else defaultSubscriptionId)
  trigger?: number;                   // bump this to fire a submit

  // Callbacks back to parent
  onAnswer?: (answer: string) => void;
  onError?: (err: string) => void;
  onStatus?: (s: string) => void;
};

export default function ChatGPTConsumerWidget({
  contractAddress,
  rpcUrl,
  chainId = 43113n, // Fuji default
  defaultSubscriptionId,
  externalQuestion,
  externalSubscriptionId,
  trigger,
  onAnswer,
  onError,
  onStatus,
}: Props) {
  const { signEvmTransaction } = useSignEvmTransaction();
  const { evmAddress } = useEvmAddress();

  const [question, setQuestion] = useState('');
  const [subId, setSubId] = useState<string>(defaultSubscriptionId ? defaultSubscriptionId.toString() : '');
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string>('');
  const [lastErr, setLastErr] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  const publicClient = useMemo(() => {
    const c = { ...DEFAULT_CHAIN, id: Number(chainId), rpcUrls: { default: { http: [rpcUrl] } } };
    return createPublicClient({ chain: c as any, transport: http(rpcUrl) });
  }, [chainId, rpcUrl]);

  // --- Read helpers ---
  async function readOutputs(): Promise<{ ans: string; err: string }> {
    const [ans, err] = await Promise.all([
      publicClient.readContract({
        address: contractAddress,
        abi: CHATGPT_CONSUMER_ABI,
        functionName: 'lastAnswer',
        args: [],
      }) as Promise<string>,
      publicClient.readContract({
        address: contractAddress,
        abi: CHATGPT_CONSUMER_ABI,
        functionName: 'getLastError',
        args: [],
      }) as Promise<string>,
    ]);
    return { ans: ans || '', err: err || '' };
  }

  async function refreshOutputs() {
    try {
      const { ans, err } = await readOutputs();
      setAnswer(ans);
      setLastErr(err);
    } catch (e: any) {
      setStatus(`Read failed: ${e?.message || e}`);
    }
  }

  // Poll for fulfillment until outputs change from a baseline
  async function waitForFulfillment(
    baseline: { ans: string; err: string },
    opts?: { timeoutMs?: number; intervalMs?: number; minDisplayMs?: number }
  ): Promise<{ ans: string; err: string; waitedMs: number }> {
    const timeoutMs = opts?.timeoutMs ?? 30000;      // 30s cap
    const intervalMs = opts?.intervalMs ?? 1200;     // ~1.2s polling
    const minDisplayMs = opts?.minDisplayMs ?? 3000; // minimum “thinking” time
    const start = Date.now();

    let elapsed = 0;
    while (elapsed < timeoutMs) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const { ans, err } = await readOutputs();
      // changed AND not both empty
      const changed = ans !== baseline.ans || err !== baseline.err;
      const hasSomething = (ans && ans.trim().length > 0) || (err && err.trim().length > 0);
      if (changed && hasSomething) {
        // ensure min display time before returning
        const waited = Date.now() - start;
        if (waited < minDisplayMs) {
          await new Promise((r) => setTimeout(r, minDisplayMs - waited));
        }
        return { ans, err, waitedMs: Date.now() - start };
      }
      elapsed = Date.now() - start;
      onStatus?.('Waiting for Chainlink fulfillment…');
    }
    // timeout – return current snapshot (likely empty / unchanged)
    const snap = await readOutputs();
    const waited = Date.now() - start;
    if (waited < minDisplayMs) {
      await new Promise((r) => setTimeout(r, minDisplayMs - waited));
    }
    return { ans: snap.ans, err: snap.err, waitedMs: Date.now() - start };
  }

  // --- Fee helpers ---
  async function getNonce(address: string) {
    return await rpc<string>(rpcUrl, 'eth_getTransactionCount', [address, 'pending']);
  }

  async function getEip1559Fees() {
    try {
      const [base] = await Promise.all([
        rpc<any>(rpcUrl, 'eth_feeHistory', [1, 'latest', []]).catch(() => null),
      ]);
      const maxPriority = await rpc<string>(rpcUrl, 'eth_maxPriorityFeePerGas', []);
      const baseHex = base?.baseFeePerGas?.[base?.baseFeePerGas.length - 1];
      const baseBn = baseHex ? BigInt(baseHex) : 0n;
      const prioBn = BigInt(maxPriority);
      const maxFeePerGas = (baseBn * 2n) + prioBn;
      return {
        type: 'eip1559' as const,
        maxFeePerGas,
        maxPriorityFeePerGas: prioBn,
      };
    } catch {
      const gasPrice = await rpc<string>(rpcUrl, 'eth_gasPrice', []);
      return { type: 'legacy' as const, gasPrice: BigInt(gasPrice) };
    }
  }

  async function estimateGas(tx: {
    from: string;
    to: string;
    data: string;
    value?: string;
  }) {
    const gasHex = await rpc<string>(rpcUrl, 'eth_estimateGas', [tx]);
    return BigInt(gasHex);
  }

  // --- Submit: sign with embedded wallet, then broadcast ---
  const handleSubmit = async (overrideQ?: string, overrideSubId?: bigint) => {
    const q = (overrideQ ?? question).trim();
    const subIdNum = overrideSubId ?? (subId ? BigInt(subId) : 0n);

    if (!evmAddress) {
      const msg = 'Connect your embedded wallet first.';
      setStatus(msg); onStatus?.(msg); return;
    }
    if (!q) {
      const msg = 'Please type a question.';
      setStatus(msg); onStatus?.(msg); return;
    }
    if (subIdNum === 0n) {
      const msg = 'Enter a valid subscriptionId (uint64).';
      setStatus(msg); onStatus?.(msg); return;
    }

    try {
      setSending(true);
      setStatus('Preparing transaction…'); onStatus?.('Preparing transaction…');
      setTxHash(null);

      // Take a baseline snapshot BEFORE sending (to detect change)
      const baseline = await readOutputs();

      // Encode call data
      const data = encodeFunctionData({
        abi: CHATGPT_CONSUMER_ABI,
        functionName: 'askQuestion',
        args: [subIdNum, q],
      });

      // Nonce & fees
      const [nonceHex, fees] = await Promise.all([getNonce(evmAddress), getEip1559Fees()]);

      // Gas estimate with buffer
      let estGas: bigint;
      try {
        estGas = await estimateGas({ from: evmAddress, to: contractAddress, data });
      } catch {
        estGas = 200000n;
      }
      const gasWithBuffer = estGas + (estGas / 3n);

      // Build tx (IMPORTANT: use 'gas')
      const txBase = {
        to: contractAddress as `0x${string}`,
        value: 0n,
        nonce: BigInt(nonceHex),
        gas: gasWithBuffer,
        chainId: BigInt(chainId),
        data: data as `0x${string}`,
      };

      // Balance check
      const bal = await getBalance(rpcUrl, evmAddress);
      const estCost =
        fees.type === 'eip1559'
          ? gasWithBuffer * fees.maxFeePerGas
          : gasWithBuffer * (fees as any).gasPrice;
      if (bal < estCost) {
        const msg = `Insufficient AVAX on Fuji. Need ~${formatAvax(estCost)}, you have ${formatAvax(bal)}.`;
        setStatus(msg); onStatus?.(msg); onError?.(msg);
        setSending(false);
        return;
      }

      // Fee style
      const tx =
        fees.type === 'eip1559'
          ? { ...txBase, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, type: 'eip1559' as const }
          : { ...txBase, gasPrice: (fees as any).gasPrice, type: 'legacy' as const };

      setStatus('Requesting signature…'); onStatus?.('Requesting signature…');
      const result = await signEvmTransaction({ evmAccount: evmAddress, transaction: tx });

      const raw = result?.signedTransaction as `0x${string}` | undefined;
      if (!raw) throw new Error('No signedTransaction returned');

      setStatus('Broadcasting…'); onStatus?.('Broadcasting…');
      const hash = await rpc<string>(rpcUrl, 'eth_sendRawTransaction', [raw]);
      setTxHash(hash);

      setStatus('Sent! Waiting for fulfillment…'); onStatus?.('Sent! Waiting for fulfillment…');

      // Wait (poll) for fulfillment with a min 3s “thinking” display
      const waited = await waitForFulfillment(baseline, {
        timeoutMs: 30000,
        intervalMs: 1200,
        minDisplayMs: 3000,
      });

      // Update widget UI
      setAnswer(waited.ans);
      setLastErr(waited.err);

      // Callback to page
      if (waited.err) onError?.(waited.err);
      if (waited.ans) onAnswer?.(waited.ans);
      if (!waited.ans && !waited.err) {
        onStatus?.('No fulfillment yet — try Refresh output.');
      }

      setStatus('Done.');
      onStatus?.('Done.');
    } catch (e: any) {
      const msg = `Failed: ${e?.message || e}`;
      setStatus(msg);
      onStatus?.(msg);
      onError?.(msg);
    } finally {
      setSending(false);
    }
  };

  // Auto-submit when parent bumps trigger
  useEffect(() => {
    if (typeof trigger === 'number' && trigger > 0 && (externalQuestion ?? '').trim()) {
      const sId = externalSubscriptionId ?? (defaultSubscriptionId ?? 0n);
      setQuestion(externalQuestion as string);
      setSubId(String(sId));
      void handleSubmit(externalQuestion, sId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return (
    <div style={{ maxWidth: 560, padding: 16, border: '1px solid #e5e7eb', borderRadius: 12 }}>
      <h3 style={{ marginTop: 0 }}>ChatGPTConsumer — Ask a question</h3>

      <label style={{ display: 'block', fontSize: 12, opacity: 0.8 }}>Subscription ID (uint64)</label>
      <input
        value={subId}
        onChange={(e) => setSubId(e.target.value)}
        placeholder="e.g. 1234"
        inputMode="numeric"
        style={{ width: '100%', padding: 10, margin: '6px 0 12px', borderRadius: 8, border: '1px solid #d1d5db' }}
      />

      <label style={{ display: 'block', fontSize: 12, opacity: 0.8 }}>Question</label>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask me anything…"
        style={{ width: '100%', padding: 10, margin: '6px 0 12px', borderRadius: 8, border: '1px solid #d1d5db' }}
      />

      <button
        disabled={sending}
        onClick={() => handleSubmit()}
        style={{
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid #111827',
          background: sending ? '#e5e7eb' : '#111827',
          color: sending ? '#111827' : '#fff',
          cursor: sending ? 'not-allowed' : 'pointer',
        }}
      >
        {sending ? 'Submitting…' : 'Submit to Chainlink'}
      </button>

      <button
        onClick={refreshOutputs}
        style={{
          marginLeft: 8,
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid #d1d5db',
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        Refresh output
      </button>

      <div style={{ marginTop: 14, fontSize: 13 }}>
        <div><strong>Status:</strong> {status || '—'}</div>
        {txHash && (
          <div style={{ wordBreak: 'break-all' }}>
            <strong>Tx Hash:</strong> {txHash}
          </div>
        )}
      </div>

      <hr style={{ margin: '16px 0' }} />

      <div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Last Answer</div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f9fafb', padding: 12, borderRadius: 8 }}>
{answer || '(empty)'}
        </pre>

        <div style={{ fontSize: 12, opacity: 0.8, margin: '10px 0 6px' }}>Last Error</div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f9fafb', padding: 12, borderRadius: 8 }}>
{lastErr || '(none)'}
        </pre>
      </div>
    </div>
  );
}
