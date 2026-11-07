export class AgentOperationError extends Error {
  constructor(error, delivery, code) {
    super(error.message, { cause: error }); this.name = "AgentOperationError";
    this.delivery = delivery; this.code = code; this.statusCode = error.statusCode;
  }
}
