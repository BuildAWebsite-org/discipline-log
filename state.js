const { getStore } = require("@netlify/blobs");

// Reads/writes one JSON blob per logged-in user, keyed by their stable Identity ID.
// Auth is handled entirely by Netlify Identity: this function only runs the
// data logic if context.clientContext.user is present, which Netlify populates
// automatically when the request carries a valid Identity JWT.
exports.handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;

  if(!user){
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Not authenticated" })
    };
  }

  const store = getStore("discipline-log-data");
  const key = user.sub;

  try{
    if(event.httpMethod === "GET"){
      const data = await store.get(key, { type: "json" });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: data || null })
      };
    }

    if(event.httpMethod === "POST"){
      let payload;
      try{
        payload = JSON.parse(event.body);
      }catch(e){
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
      }
      await store.setJSON(key, payload);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true })
      };
    }

    return { statusCode: 405, body: "Method not allowed" };
  }catch(err){
    console.error("state function error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
