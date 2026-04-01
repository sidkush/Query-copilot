import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useStore } from "../store";

export default function OAuthCallback() {
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useStore((s) => s.setAuth);
  const setTutorialComplete = useStore((s) => s.setTutorialComplete);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const provider = localStorage.getItem("oauth_provider") || "google";

    if (!code || !state) {
      setError("Missing OAuth parameters.");
      return;
    }

    api.handleOAuthCallback(provider, code, state)
      .then((data) => {
        const user = data.user || { email: "", name: "" };
        setAuth({ email: user.email, name: user.name }, data.access_token);
        localStorage.removeItem("oauth_provider");

        // Only show tutorial for brand-new users who haven't completed it
        const isNew = user.is_new === true;
        const tutorialDone = user.tutorial_completed === true;

        if (isNew && !tutorialDone) {
          navigate("/tutorial");
        } else {
          // Returning user — sync tutorial state and go to dashboard
          setTutorialComplete(true);
          navigate("/dashboard");
        }
      })
      .catch((err) => {
        setError(err.message || "OAuth failed. Please try again.");
      });
  }, [searchParams, navigate, setAuth, setTutorialComplete]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        {error ? (
          <div>
            <div className="text-red-400 text-lg mb-4">{error}</div>
            <button
              onClick={() => navigate("/login")}
              className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
            >
              Back to login
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400">Completing sign in...</p>
          </div>
        )}
      </div>
    </div>
  );
}
