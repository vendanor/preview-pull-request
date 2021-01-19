import sha256 from 'crypto-js/sha256';

export function generateHash(prId: number, salt: string) {
  return sha256(`${prId}${salt}`).toString().substr(0, 7);
}
