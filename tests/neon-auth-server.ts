type Session = {user: {id: string}} | null;

export function createNeonAuth() {
  return {
    async getSession(): Promise<{data: Session}> {
      return {data: null};
    },
    handler() {
      const response = async () => new Response(null, {status: 404});
      return {GET: response, POST: response, PUT: response, DELETE: response, PATCH: response};
    },
  };
}
