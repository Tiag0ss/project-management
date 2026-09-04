/**
 * Legacy Express routers (frozen). Mounted by server/index until domains move to server/modules.
 * Do not add features here — rebuild under server/modules/<domain>.
 */
export { default as mountLegacyNote } from './routes/auth';
