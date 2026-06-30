/**
 * Multi-Symbol RSI Auto-Trader Bot
 * Checks 1-hour RSI for each symbol via Twelve Data API.
 * Places a market buy via Robinhood MCP when RSI drops below threshold.
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY   - Your Anthropic API key
 *   TWELVE_DATA_API_KEY - Your Twelve Data API key (free at twelvedata.com)
 *   RH_ACCOUNT_NUMBER   - Your Robinhood agentic account number
 */

const RSI_PERIOD = 14;
const RSI_INTERVAL = "1h";
const RH_MCP_URL = "https://agent.robinhood.com/mcp/trading";

// Add or remove symbols here
const RULES = [
  { symbol: "MVLL",  rsi_threshold: 30, quantity: "1" },
  { symbol: "SNDU", rsi_threshold: 30, quantity: "1" },
  { symbol: "CRWL", rsi_threshold: 30, quantity: "1" },
  { symbol: "WDCX", rsi_threshold: 30, quantity: "1" },
  { symbol: "INTW", rsi_threshold: 30, quantity: "1" },
];

async function getRSI(symbol) {
  const url = `https://api.twelvedata.com/rsi?symbol=${symbol}&interval=${RSI_INTERVAL}&time_period=${RSI_PERIOD}&apikey=${process.env.TWELVE_DATA_API_KEY}&outputsize=1&format=JSON`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status === "error") {
    throw new Error(`Twelve Data error: ${data.message}`);
  }

  const rsi = parseFloat(data.values[0].rsi);
  const datetime = data.values[0].datetime;
  return { rsi, datetime };
}

async function getQuote(symbol) {
  const url = `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${process.env.TWELVE_DATA_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return parseFloat(data.close);
}

async function placeOrder(symbol, quantity, price) {
  const accountNumber = process.env.RH_ACCOUNT_NUMBER;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "mcp-client-2025-04-04",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      mcp_servers: [{ type: "url", url: RH_MCP_URL, name: "rh" }],
      system: `You are a trading assistant. Place a fractional market buy order using the Robinhood MCP tool.
Account number: ${accountNumber}
After placing, respond ONLY with valid JSON (no markdown):
{"success": true/false, "order_id": "...", "message": "..."}`,
      messages: [
        {
          role: "user",
          content: `Place a market buy order for ${quantity} shares of ${symbol} on account ${accountNumber}. Current price is ~$${price.toFixed(2)}.`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return { success: true, message: text.slice(0, 200) };
  }
}

async function processRule({ symbol, rsi_threshold, quantity }) {
  console.log(`\n--- ${symbol} ---`);

  // 1. Fetch RSI
  let rsiData;
  try {
    rsiData = await getRSI(symbol);
    console.log(`RSI(1h): ${rsiData.rsi.toFixed(2)} @ ${rsiData.datetime}`);
  } catch (err) {
    console.error(`Failed to fetch RSI for ${symbol}:`, err.message);
    return;
  }

  // 2. Check threshold
  if (rsiData.rsi >= rsi_threshold) {
    console.log(`RSI ${rsiData.rsi.toFixed(2)} >= ${rsi_threshold}. No trade.`);
    return;
  }

  // 3. RSI below threshold — place order
  console.log(`RSI ${rsiData.rsi.toFixed(2)} < ${rsi_threshold} — TRIGGER! Placing buy for ${quantity} shares...`);

  let price = 0;
  try {
    price = await getQuote(symbol);
    console.log(`Current price: $${price.toFixed(2)}`);
  } catch (err) {
    console.warn(`Could not fetch quote for ${symbol}, proceeding anyway:`, err.message);
  }

  try {
    const order = await placeOrder(symbol, quantity, price);
    if (order.success !== false) {
      console.log(`✅ Order placed: ${order.order_id || order.message}`);
    } else {
      console.error(`❌ Order failed: ${order.message}`);
    }
  } catch (err) {
    console.error(`Failed to place order for ${symbol}:`, err.message);
  }
}

async function main() {
  console.log(`\n[${new Date().toISOString()}] RSI Bot starting — checking ${RULES.length} symbols...`);

  for (const rule of RULES) {
    await processRule(rule);
  }

  console.log(`\n[${new Date().toISOString()}] Done.`);
}

main();