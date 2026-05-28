import { config } from "dotenv"
import { Agent, run, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, setTracingExportApiKey, tool } from "@openai/agents"
import { z } from 'zod'
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)
config({
    path: '.env',
})
setTracingDisabled(true)
let todo: any[] = []
// 定义bash工具
const bash = tool({
    name: "bash",
    description: "执行bash命令",
    parameters: z.object({
        command: z.string().describe("要执行的bash命令"),
    }),
    execute: async (params) => {
        const { command } = params

        // 危险命令黑名单
        const dangerousPatterns = [
            /\brm\s+.*-rf\s+\/($|\s|;)/,           // rm -rf /
            /\brm\s+.*--no-preserve-root/,          // rm --no-preserve-root
            /\bmkfs\.?\w*\b/,                       // mkfs, mkfs.ext4 等
            /\bdd\s+.*of=\/dev\/\w+/,               // dd 写设备
            /\bshutdown\b/,                         // 关机
            /\breboot\b/,                           // 重启
            /\bhalt\b/,                             // 停机
            /\bpoweroff\b/,                         // 断电
            /:\(\)\s*{\s*:\|:\s*&\s*};:/,          // fork bomb
            />\s*\/dev\/\w+/,                       // 重定向到设备
            /\bsudo\b/,                             // 提权
            /\bsu\s+-/,                             // 切换用户
        ]

        for (const pattern of dangerousPatterns) {
            if (pattern.test(command)) {
                return { error: `危险命令已被拦截: "${command}"` }
            }
        }

        try {
            const { stdout, stderr } = await execAsync(command, { timeout: 30000 })
            return { stdout, stderr }
        } catch (error: any) {
            return { error: error?.message || String(error) }
        }
    }
})
const get_weather = tool({
    name: "get_weather",
    description: "获取天气",
    parameters: z.object({
        location: z.string().describe("要获取天气的地点"),
    }),
    execute: async (params) => {
        const { location } = params
        return { weather: `天气是晴朗的，温度是25摄氏度` }
    }
})
const setTodoList = tool({
    name: "setTodo",
    description: "设置本次任务待办事项",
    parameters: z.object({
        todoList: z.array(z.string()).describe("待办事项"),
    }),
    execute: async (params) => {
        const { todoList } = params
        todo = todoList
        return { todo }
    }
})
const updateTodoList = tool({
    name: "updateTodo",
    description: "更新待办事项完成状态",
    parameters: z.object({
        index: z.number().describe("待办事项的索引"),
        todoItem: z.string().describe("待办事项"),
    }),
    execute: async (params) => {
        const { index, todoItem } = params
        todo.splice(index, 1, todoItem)
        return { todo }
    }
})
const ExcuteAgent = new Agent({
    name: "s01_agent",
    instructions: `你是一个执行助手，你擅长执行任务,当前的任务是${todo}`,
    tools: [bash, get_weather, updateTodoList],
})
const agent = new Agent({
    name: "s01_agent",
    instructions: "你是一个问答助手，你擅长回答问题",
})
const PlanAgent = new Agent({
    name: "s01_agent",
    instructions: "你是一个计划助手，你擅长根据用户的问题拆分任务 ",
    tools: [setTodoList],
    handoffDescription: "简单任务直接使用agent回答，复杂任务使用ExcuteAgent执行任务",
    handoffs: [ExcuteAgent, agent],
})

run(PlanAgent, "你好").then((res) => {
    console.log(res.history, "========\n", res.finalOutput)
}).catch((err) => {
    console.log(err)
})
