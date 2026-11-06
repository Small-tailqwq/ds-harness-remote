# Local Direct v1 Golden Vectors

`noise-ik.json` fixes the Local Direct handshake: the same
`Noise_IK_25519_ChaChaPoly_SHA256` suite as protocol v1, with the
`DSH-REMOTE-LOCAL` prologue label.

It records both handshake messages with empty payloads, the handshake hash
both peers must derive, one initiator transport ciphertext, and the pairing
proof `HMAC-SHA256(code, "DSH-REMOTE-LOCAL\0pair-proof\0v=1\0" || handshakeHash)`.

All binary fields use base64url without padding. All keys are synthetic; never
use them outside tests. Do not regenerate after a dependency update without an
interoperability review.
