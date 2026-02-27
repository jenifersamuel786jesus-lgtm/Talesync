import { Navigate, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import LifeStory from "./pages/LifeStory";
import LoginSignup from "./pages/LoginSignup";
import MemoryChain from "./pages/MemoryChain";
import RecordMemory from "./pages/RecordMemory";
import { getToken } from "./services/auth";

function Protected({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/auth" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<LoginSignup />} />
      <Route
        path="/"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/record"
        element={
          <Protected>
            <RecordMemory />
          </Protected>
        }
      />
      <Route
        path="/story/:memoryId"
        element={
          <Protected>
            <LifeStory />
          </Protected>
        }
      />
      <Route
        path="/chain/:memoryId"
        element={
          <Protected>
            <MemoryChain />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
