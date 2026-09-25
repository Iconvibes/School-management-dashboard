/**
 * Minimal ambient types for `jsonwebtoken` (the package ships none and the
 * project deliberately avoids a @types install for one call site). Only the
 * surface token.ts uses is declared.
 */
declare module "jsonwebtoken" {
  export interface SignOptions {
    expiresIn?: string | number;
    [key: string]: unknown;
  }

  export interface JwtPayload {
    [key: string]: unknown;
  }

  export function sign(
    payload: object,
    secretOrPrivateKey: string,
    options?: SignOptions
  ): string;

  export function verify(
    token: string,
    secretOrPublicKey: string
  ): JwtPayload | string;

  const jwt: {
    sign: typeof sign;
    verify: typeof verify;
  };
  export default jwt;
}
