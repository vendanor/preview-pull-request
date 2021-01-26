import sha256 from 'crypto-js/sha256';
import enc64 from 'crypto-js/enc-base64';
import encUtf8 from 'crypto-js/enc-utf8';

export function generateHash(prId: number, salt: string) {
  return sha256(`${prId}${salt}`).toString().substr(0, 7);
}

export function encode(myString: string) {
  const encodedWord = encUtf8.parse(myString);
  return enc64.stringify(encodedWord);
}

export function decode(encoded: string) {
  const encodedWord = enc64.parse(encoded);
  return encUtf8.stringify(encodedWord);
}
