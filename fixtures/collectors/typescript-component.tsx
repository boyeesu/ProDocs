import type { ReactNode } from "react";
export { createElement } from "./factory.js";

export type Identifier = string | number;

export interface ComponentProps {
  title: string;
  render(value: Identifier): ReactNode;
}

export enum State {
  Ready,
  Running
}

export class Component {
  #state = State.Ready;

  constructor(readonly props: ComponentProps) {}

  render(): ReactNode {
    return <section>{this.props.title}</section>;
  }
}

export const createComponent = (props: ComponentProps) => new Component(props);
