import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import antdTheme from './theme/antdTheme'
import App from './App.jsx'
import './index.css'

const USER_ID_STORAGE_KEY = 'activeUserId'

if (!window.__userFetchPatched) {
  const nativeFetch = window.fetch.bind(window)
  window.fetch = (input, init = {}) => {
    const userId = localStorage.getItem(USER_ID_STORAGE_KEY) || '1'
    const headers = new Headers(init.headers || {})
    headers.set('x-user-id', userId)
    return nativeFetch(input, {
      ...init,
      headers,
    })
  }
  window.__userFetchPatched = true
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
)
