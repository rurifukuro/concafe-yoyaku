import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';

/** 前回ログインしたメールアドレスの保存キー */
const ADMIN_EMAIL_KEY = 'concafe_admin_email';

export function AdminLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 前回ログインしたメールアドレスを初期表示（運用者交代時は入力し直し）
  useEffect(() => {
    const saved = localStorage.getItem(ADMIN_EMAIL_KEY);
    if (saved) setEmail(saved);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await signIn(email, password);
    if (err) {
      setError(err);
    } else {
      // 成功したメールアドレスだけ次回用に記憶する
      localStorage.setItem(ADMIN_EMAIL_KEY, email.trim());
    }
    setLoading(false);
  }

  return (
    <div className="admin-login">
      <h2>管理者ログイン</h2>
      <form onSubmit={handleSubmit}>
        <label>
          メールアドレス
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label>
          パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
      <p className="admin-login-note">
        ※前回のメールアドレスを記憶します。運用者が変わったときは入力し直してください。
      </p>
    </div>
  );
}
