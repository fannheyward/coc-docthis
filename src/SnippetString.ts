export class SnippetString {
  value: string;
  private _tabstop = 1;

  private static _escape(value: string): string {
    return value.replace(/\$|}|\\/g, '\\$&');
  }

  static isSnippetString(thing: any): thing is SnippetString {
    if (thing instanceof SnippetString) {
      return true;
    }
    if (!thing) {
      return false;
    }
    return typeof (<SnippetString>thing).value === 'string';
  }

  constructor(value?: string) {
    this.value = value || '';
    console.error('----SnippetString constructor:', value);
  }

  appendText(text: string) {
    console.error('----SnippetString appendText:', text);
    this.value += SnippetString._escape(text);
    return this;
  }

  appendTabstop(number = this._tabstop++) {
    console.error('----SnippetString appendTabstop:', number);
    this.value += '$';
    this.value += number;
    return this;
  }

  appendPlaceholder(value: string | ((snippet: SnippetString) => any), number: number = this._tabstop++): SnippetString {
    console.error('----SnippetString appendTabstop:', value);
    if (typeof value === 'function') {
      const nested = new SnippetString();
      nested._tabstop = this._tabstop;
      value(nested);
      this._tabstop = nested._tabstop;
      value = nested.value;
    } else {
      value = SnippetString._escape(value);
    }

    this.value += '${';
    this.value += number;
    this.value += ':';
    this.value += value;
    this.value += '}';

    return this;
  }

  appendChoice(values: string[], number: number = this._tabstop++): SnippetString {
    const value = SnippetString._escape(values.toString());

    this.value += '${';
    this.value += number;
    this.value += '|';
    this.value += value;
    this.value += '|}';

    return this;
  }

  appendVariable(name: string, defaultValue?: string | ((snippet: SnippetString) => any)): SnippetString {
    if (typeof defaultValue === 'function') {
      const nested = new SnippetString();
      nested._tabstop = this._tabstop;
      defaultValue(nested);
      this._tabstop = nested._tabstop;
      defaultValue = nested.value;
    } else if (typeof defaultValue === 'string') {
      defaultValue = defaultValue.replace(/\$|}/g, '\\$&');
    }

    this.value += '${';
    this.value += name;
    if (defaultValue) {
      this.value += ':';
      this.value += defaultValue;
    }
    this.value += '}';

    return this;
  }
}
