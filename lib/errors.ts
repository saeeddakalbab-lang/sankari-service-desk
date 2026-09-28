// An error whose message is safe to show the user, with the HTTP status to return.
export class AppError extends Error{constructor(message:string,public status=400){super(message);this.name="AppError";}}
export const forbidden=(message="Forbidden")=>new AppError(message,403);
export const conflict=(message:string)=>new AppError(message,409);
