import { handleDeletion } from '../_shared/deletionService.ts';
Deno.serve(req => handleDeletion(req, 'status'));
