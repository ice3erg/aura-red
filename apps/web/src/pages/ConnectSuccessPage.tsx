import { Link } from "react-router-dom";

export default function ConnectSuccessPage() {
  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 24 }}>
      <h1>Spotify подключен</h1>
      <p>Теперь можешь вернуться на главную.</p>
      <Link to="/home">На главную</Link>
    </div>
  );
}
