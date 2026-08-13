import { REQUIRED_ENV_KEYS } from '../lib/env'

type Props = {
  missing: string[]
}

/**
 * 未設定 Supabase 連線時嘅畫面。寧願見到一版字，都唔可以白畫面（v7 教訓）。
 */
export default function ConfigMissing({ missing }: Props) {
  const keys = missing.length > 0 ? missing : [...REQUIRED_ENV_KEYS]

  return (
    <section className="card">
      <div className="notice notice--warning">
        <p className="notice__title">未設定 Supabase 連線</p>
        <p>呢個 build 冇讀到以下環境變數，所以登入功能未開得：</p>
        <ul className="notice__list">
          {keys.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
        <p>
          本機請複製 <code>.env.example</code> 做 <code>.env.local</code> 填返真值；
          Cloudflare Pages 請喺 project 嘅 Environment variables 補返，再重新 build。
        </p>
      </div>
    </section>
  )
}
