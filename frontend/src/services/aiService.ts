// AI Service for OpenRMM
// Uses Groq API for fast/cheap AI queries

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

export interface AIQuery {
  query: string
  context?: {
    devices?: any[]
    alerts?: any[]
    scripts?: any[]
  }
}

export interface AIResponse {
  answer: string
  action?: string
  confidence: number
}

export const aiService = {
  async askQuestion(query: string, context?: any): Promise<AIResponse> {
    if (!GROQ_API_KEY) {
      return {
        answer: 'AI Copilot is not configured. Please add your Groq API key in settings.',
        confidence: 0,
      }
    }

    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            {
              role: 'system',
              content: `You are an IT support AI assistant for OpenRMM. Help users manage their devices, troubleshoot issues, and create scripts.
              
Available actions:
- Query device status
- Generate PowerShell/Bash scripts
- Analyze system metrics
- Suggest troubleshooting steps

Be concise and helpful.`,
            },
            {
              role: 'user',
              content: query,
            },
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      })

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`)
      }

      const data = await response.json()
      
      return {
        answer: data.choices[0]?.message?.content || 'No response from AI',
        confidence: 0.85,
      }
    } catch (error) {
      console.error('AI Service Error:', error)
      return {
        answer: 'Sorry, I encountered an error. Please check your API key and try again.',
        confidence: 0,
      }
    }
  },

  async generateScript(description: string, shell: 'powershell' | 'bash' | 'python'): Promise<string> {
    const prompt = `Generate a ${shell} script that does the following: ${description}
    
Requirements:
- Include error handling
- Add comments explaining each step
- Make it production-ready
- Include timeout handling where appropriate

Return only the script code, no explanations.`

    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            {
              role: 'system',
              content: 'You are a senior system administrator. Generate clean, well-documented scripts.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 2048,
        }),
      })

      const data = await response.json()
      return data.choices[0]?.message?.content || '# Script generation failed'
    } catch (error) {
      console.error('Script Generation Error:', error)
      return '# Error generating script. Please try again.'
    }
  },

  async analyzeDevice(deviceData: any): Promise<string> {
    const prompt = `Analyze this device data and provide insights:
    ${JSON.stringify(deviceData, null, 2)}
    
Look for:
- Performance issues
- Security concerns
- Optimization opportunities
- Potential failures

Provide a concise summary (2-3 sentences).`

    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            {
              role: 'system',
              content: 'You are a system monitoring AI. Analyze device metrics and provide actionable insights.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.5,
          max_tokens: 512,
        }),
      })

      const data = await response.json()
      return data.choices[0]?.message?.content || 'Analysis complete. No issues detected.'
    } catch (error) {
      console.error('Analysis Error:', error)
      return 'Unable to analyze device at this time.'
    }
  },
}

export default aiService
