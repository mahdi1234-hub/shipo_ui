import { NextRequest, NextResponse } from "next/server";

const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || "";

const SYSTEM_PROMPT = `You are a causal data analyst AI agent. When a user provides data (CSV, JSON, or structured text), you must:

1. Identify the data format and structure
2. Analyze relationships between variables
3. Identify potential causal relationships
4. Provide statistical insights
5. Suggest which variables might cause effects on others

When responding to data, structure your analysis as follows:
- Summary of the data
- Key statistical observations
- Potential causal relationships (which variables might influence others)
- Correlation insights
- Recommendations for further analysis

When no data is provided, help the user understand how to use the tool. Be concise and analytical.
Always respond in plain text with markdown formatting. Do not include code blocks unless specifically asked.`;

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!CEREBRAS_API_KEY) {
      return NextResponse.json(
        { error: "Cerebras API key not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(CEREBRAS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CEREBRAS_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama3.1-8b",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        max_tokens: 2048,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Cerebras API error:", errorText);
      return NextResponse.json(
        { error: `Cerebras API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "No response generated.";

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
