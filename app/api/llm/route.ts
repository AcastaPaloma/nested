import { GoogleGenAI } from '@google/genai'

type ChatRole = 'user' | 'assistant' | 'system'

type LlmRequest = {
  messages?: Array<{ role: ChatRole; content: string }>
  selection?: string
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

export async function POST(req: Request) {
  const body = (await req.json()) as LlmRequest

  const messages = body.messages ?? []
  const selection = body.selection?.trim()

  if (messages.length === 0) {
    return new Response('No messages provided', { status: 400 })
  }

  // Build Gemini contents array`
  // Gemini uses 'user' and 'model' roles (not 'assistant')
  const history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []

  // Add selection as context in the first user message if provided
  let selectionPrefix = ''
  if (selection) {
    selectionPrefix = `[User highlighted this text for context: "${selection}"]\n\n`
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const role = msg.role === 'assistant' ? 'model' : 'user'
    let content = msg.content

    // Prepend selection context to the first user message
    if (i === 0 && role === 'user' && selectionPrefix) {
      content = selectionPrefix + content
    }

    history.push({
      role,
      parts: [{ text: content }],
    })
  }

  console.log('Sending to Gemini:', JSON.stringify(history, null, 2))

  try {
    // Use streaming for real-time response
    const response = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash-lite',
      contents: history,
      config: {
        thinkingConfig: {
          thinkingBudget: 0, // Disable thinking for faster responses
        },
      },
    })

    // Create a readable stream to send chunks to the client
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const text = chunk.text
            if (text) {
              // Send each chunk as a Server-Sent Event
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
            }
          }
          // Signal end of stream
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Gemini API error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
