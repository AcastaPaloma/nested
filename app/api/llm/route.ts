import { NextResponse } from 'next/server'
import ollama from 'ollama'

type ChatRole = 'user' | 'assistant' | 'system'

type LlmRequest = {
  messages?: Array<{ role: ChatRole; content: string }>
  selection?: string
}

export async function POST(req: Request) {
  const body = (await req.json()) as LlmRequest

  const messages = body.messages ?? []
  const selection = body.selection?.trim()

  if (messages.length === 0) {
    return NextResponse.json({ content: 'No messages provided' }, { status: 400 })
  }

  // Build Ollama messages array, optionally prepending selection as system context
  const ollamaMessages: Array<{ role: ChatRole; content: string }> = []

  if (selection) {
    ollamaMessages.push({
      role: 'system',
      content: `User highlighted this text for context:\n${selection}`,
    })
  }

  ollamaMessages.push(...messages)

  console.log('Sending to Ollama:', JSON.stringify(ollamaMessages, null, 2))

  const response = await ollama.chat({
    model: 'mario',
    messages: ollamaMessages,
  })

  return NextResponse.json({
    content: response.message.content,
  })
}
