// An attempt id is chosen by the page, before anything is sent. The API treats the same
// id with the same request as the same attempt (apps/api/src/gate/gate.ts, sameRequest),
// so a request whose answer was lost can be sent again without making a second attempt.
// That is what makes "Try again" safe here, where creating a mandate is not (D-022).
//
// randomUUID gives 36 characters of [0-9a-f-], which satisfies the API's identifier rule
// (letters, digits and . _ : -, at most 100 characters for an attempt id).

export const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

export function newAttemptId(random: () => string = () => crypto.randomUUID()): string {
  const id = random();
  if (!ATTEMPT_ID_PATTERN.test(id)) throw new Error("The generated attempt id is not acceptable to the API.");
  return id;
}
