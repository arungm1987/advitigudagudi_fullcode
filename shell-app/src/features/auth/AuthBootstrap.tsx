import { useGetCurrentUserQuery } from "../../services/authApi";

const AuthBootstrap = () => {
  const token = localStorage.getItem("accessToken");

  const { data, isLoading, error } = useGetCurrentUserQuery(undefined, {
    skip: !token,
  });

  if (!token) {
    return <div>No session found</div>;
  }

  if (isLoading) {
    return <div>Loading session...</div>;
  }

  if (error) {
    return <div>Session expired</div>;
  }

  return (
    <div>
      <h2>Enterprise Auth Bootstrap Complete</h2>

      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
};

export default AuthBootstrap;
