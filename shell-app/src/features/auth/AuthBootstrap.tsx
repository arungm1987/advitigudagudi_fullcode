import { useGetCurrentUserQuery } from "../../services/authApi";

const AuthBootstrap = () => {
  const { data, isLoading, error } = useGetCurrentUserQuery();

  if (isLoading) {
    return <div>Checking session...</div>;
  }

  if (error) {
    return <div>No active session</div>;
  }

  return (
    <div>
      <h1>Welcome 🎉</h1>

      <h3>Secure HttpOnly Cookie Authentication Active</h3>

      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
};

export default AuthBootstrap;
