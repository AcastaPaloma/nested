import { GoogleGenAI } from '@google/genai'
import ollama from 'ollama'

type ChatRole = 'user' | 'assistant' | 'system'

// Available model providers
type ModelProvider = 'gemini' | 'ollama'

type LlmRequest = {
  messages?: Array<{ role: ChatRole; content: string }>
  selection?: string
  model?: string // Model name (e.g., 'gemini-2.5-flash-lite', 'llama3', 'mario')
  provider?: ModelProvider // 'gemini' or 'ollama'
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

// Default models for each provider
const DEFAULT_MODELS: Record<ModelProvider, string> = {
  gemini: 'gemini-2.5-flash-lite',
  ollama: 'gemma3:270m',
}

export async function POST(req: Request) {
  const body = (await req.json()) as LlmRequest

  const messages = body.messages ?? []
  const selection = body.selection?.trim()
  const provider: ModelProvider = body.provider ?? 'gemini'
  const model = body.model ?? DEFAULT_MODELS[provider]

  if (messages.length === 0) {
    return new Response('No messages provided', { status: 400 })
  }

  // Route to appropriate provider
  if (provider === 'ollama') {
    return handleOllama(messages, selection, model)
  } else {
    return handleGemini(messages, selection, model)
  }
}

// Handle Ollama requests with streaming
async function handleOllama(
  messages: Array<{ role: ChatRole; content: string }>,
  selection: string | undefined,
  model: string
) {
  // Build Ollama messages array
  const ollamaMessages: Array<{ role: ChatRole; content: string }> = []

  if (selection) {
    ollamaMessages.push({
      role: 'system',
      content: `User highlighted this text for context:\n${selection}`,
    })
  }

  ollamaMessages.push(...messages)

  console.log(`Sending to Ollama (${model}):`, JSON.stringify(ollamaMessages, null, 2))

  try {
    // Use streaming for real-time response
    const response = await ollama.chat({
      model,
      messages: ollamaMessages,
      stream: true,
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const text = chunk.message?.content
            if (text) {
              // Send just the incremental chunk (client will accumulate)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
            }
          }
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
    console.error('Ollama API error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Handle Gemini requests with streaming
async function handleGemini(
  messages: Array<{ role: ChatRole; content: string }>,
  selection: string | undefined,
  model: string
) {
  // Build Gemini contents array
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

  console.log(`Sending to Gemini (${model}):`, JSON.stringify(history, null, 2))

  try {
    // Use streaming for real-time response
    const response = await ai.models.generateContentStream({
      model,
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
