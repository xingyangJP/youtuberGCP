import { GoogleGenAI } from '@google/genai'
import dotenv from 'dotenv'

dotenv.config()

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

try {
  const models = await genAI.models.list()
  console.log('Available models:')
  for await (const model of models) {
    if (model.name.includes('veo') || model.name.includes('video')) {
      console.log('-', model.name, '|', model.displayName)
    }
  }
} catch (error) {
  console.error('Error:', error.message)
}
