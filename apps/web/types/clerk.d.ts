export {};

declare global {
  // Shape of the custom session claim set in Clerk:
  // { "metadata": "{{user.public_metadata}}" }
  interface CustomJwtSessionClaims {
    metadata?: {
      role?: "admin";
    };
  }
}
