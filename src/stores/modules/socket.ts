import { useUserStore } from '@/stores/modules/user'
import { defineStore } from 'pinia'
import mittBus from '@/utils/mittBus'
import { CHANNEL_DEFAULT, CHANNEL_KICK_OFF } from '@/config/consts'
import { LOGIN_URL } from '@/config'
import router from '@/router'
import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'

const socketUrl = import.meta.env.VITE_SOCKET_URL

const MAX_RECONNECT_COUNT = 3

/**
 * 使用socket
 * @param url
 * @returns {{init: (function(): void), socket: null}}
 */
export const useSocketStore = defineStore('socket', () => {
  /**
   * 定义socket变量
   *
   * @type {WebSocket|null}
   */
  const socket = ref<WebSocket | null>(null)

  const canReconnect = ref(true)

  const reconnectCount = ref(0)

  const _onOpen = () => {
    canReconnect.value = true
    reconnectCount.value = 0
  }

  const _onMessage = (event: MessageEvent) => {
    const { data } = event
    const userStore = useUserStore()
    try {
      const res = JSON.parse(data)
      switch (res.channel) {
        case CHANNEL_DEFAULT:
          break
        case CHANNEL_KICK_OFF:
          close()
          // 1.清除 Token
          userStore.setToken('')
          ElMessageBox.alert('您已经被强制踢下线了！', '温馨提示', {
            confirmButtonText: '确定',
            type: 'warning',
            callback: () => {
              // 2.重定向到登陆页
              router.replace(LOGIN_URL)
            }
          })
          break
        default:
          mittBus.emit(`socket.${res.channel}`, res.data)
      }
      console.log('接收到的消息：', res)
    } catch (e) {
      /* empty */
    }
  }

  const _onError = (event: Event) => {
    mittBus.emit('socket.error', event)
  }

  const _onClose = () => {
    socket.value = null
    // 重连
    if (canReconnect.value && reconnectCount.value < MAX_RECONNECT_COUNT) {
      // 增加一次重连次数
      reconnectCount.value++
      // 重新连接
      setTimeout(() => {
        open()
      }, reconnectCount.value * 5000)
    }
  }

  /**
   * 初始化开启socket
   */
  const open = () => {
    if (socket.value) return
    const userStore = useUserStore()
    // 建立WebSocket连接
    const webSocket = new WebSocket(socketUrl, [userStore.token])

    // 监听WebSocket事件
    webSocket.onopen = _onOpen
    webSocket.onmessage = _onMessage
    webSocket.onerror = _onError
    webSocket.onclose = _onClose

    // 连接时处理
    socket.value = webSocket
  }

  /**
   * 关闭socket
   */
  const close = () => {
    if (!socket.value) return
    canReconnect.value = false
    reconnectCount.value = 0
    socket.value.close()
    socket.value = null
  }

  const send = (data: any, channel: string = CHANNEL_DEFAULT) => {
    if (!socket.value || socket.value.readyState !== 1) return
    if (typeof data !== 'object') {
      data = { data }
    }
    const msgData = {
      channel,
      data
    }
    socket.value.send(JSON.stringify(msgData))
  }

  return {
    open,
    send,
    close
  }
})