/**
 * Multi-Symbol Percentage Drop Buy Bot
 * Checks each symbol's current price vs previous day's close via Twelve Data API.
 * Places a market buy via Robinhood MCP when the drop hits the threshold —
 * limited to ONE buy per symbol per day.
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY   - Your Anthropic API key
 *   TWELVE_DATA_API_KEY - Your Twelve Data API key (free at twelvedata.com)
 *   RH_ACCOUNT_NUMBER   - Your Robinhood agentic account number
 */

const fs = require("fs");
const path = require("path");

const RH_MCP_URL = "https://agent.robinhood.com/mcp/trading";
const STATE_FILE = path.join(__dirname, "bought-today.json");

// Add or remove symbols/rules here
const RULES = [
  { symbol: "INTW", drop_threshold_pct: -20, quantity: "1" },
  { symbol: "WDCX", drop_threshold_pct: -20, quantity: "1" },
  { symbol: "SNDU", drop_threshold_pct: -20, quantity: "1" },
  { symbol: "CRWL", drop_threshold_pct: -20, quantity: "1" },
];

function todayKey() {
  // YYYY-MM-DD in UTC
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const state = JSON.parse(raw);
    // Reset if the stored date isn't today
    if (state.date !== todayKey()) {
      return { date: todayKey(), bought: [] };
    }
    return state;
  } catch {
    return { date: todayKey(), bought: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function getQuoteData(symbol) {
  const url = `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${process.env.TWELVE_DATA_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status === "error") {
    throw new Error(`Twelve Data error: ${data.message}`);
  }

  const currentPrice = parseFloat(data.close);
  const previousClose = parseFloat(data.previous_close);
  const changePct = ((currentPrice - previousClose) / previousClose) * 100;

  return { currentPrice, previousClose, changePct };
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
      system: `You are a trading assistant. Place a market buy order using the Robinhood MCP tool.
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

async function processRule({ symbol, drop_threshold_pct, quantity }, state) {
  console.log(`\n--- ${symbol} ---`);

  // Skip if already bought today
  if (state.bought.includes(symbol)) {
    console.log(`Already bought ${symbol} today. Skipping.`);
    return;
  }

  let quoteData;
  try {
    quoteData = await getQuoteData(symbol);
    console.log(
      `Current: $${quoteData.currentPrice.toFixed(2)} | Prev close: $${quoteData.previousClose.toFixed(2)} | Change: ${quoteData.changePct.toFixed(2)}%`
    );
  } catch (err) {
    console.error(`Failed to fetch quote for ${symbol}:`, err.message);
    return;
  }

  // Trigger if change is at or below the (negative) threshold
  if (quoteData.changePct > drop_threshold_pct) {
    console.log(
      `Change ${quoteData.changePct.toFixed(2)}% > threshold ${drop_threshold_pct}%. No trade.`
    );
    return;
  }

  console.log(
    `Change ${quoteData.changePct.toFixed(2)}% <= ${drop_threshold_pct}% — TRIGGER! Placing buy for ${quantity} shares...`
  );

  try {
    const order = await placeOrder(symbol, quantity, quoteData.currentPrice);
    if (order.success !== false) {
      console.log(`✅ Order placed: ${order.order_id || order.message}`);
      state.bought.push(symbol); // Mark as bought today
    } else {
      console.error(`❌ Order failed: ${order.message}`);
    }
  } catch (err) {
    console.error(`Failed to place order for ${symbol}:`, err.message);
  }
}

async function main() {
  console.log(
    `\n[${new Date().toISOString()}] Drop Bot starting — checking ${RULES.length} rule(s)...`
  );

  const state = loadState();
  console.log(`State date: ${state.date} | Already bought today: ${state.bought.join(", ") || "none"}`);

  for (const rule of RULES) {
    await processRule(rule, state);
  }

  saveState(state);
  console.log(`\n[${new Date().toISOString()}] Done. Bought today: ${state.bought.join(", ") || "none"}`);
}

main();