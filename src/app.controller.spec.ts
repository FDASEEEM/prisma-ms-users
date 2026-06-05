import { AppController } from "./app.controller";

describe("AppController", () => {
  const controller = new AppController();

  it("returns exact health response", () => {
    const result = controller.health();
    expect(result).toEqual({ status: "ok" });
  });
});