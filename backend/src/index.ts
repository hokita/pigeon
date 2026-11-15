import { initFirebase } from './config/firebase.js'
import { createApp } from './app.js'

initFirebase()

const parsedPort = Number(process.env.PORT)
const port = Number.isNaN(parsedPort) ? 8080 : parsedPort
createApp({ mcpToken: process.env.PIGEON_MCP_TOKEN, frontendUrl: process.env.FRONTEND_URL }).listen(
  port,
  () => {
    console.log(`Listening on port ${port}`)
  }
)
