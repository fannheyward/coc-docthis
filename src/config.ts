import { workspace, WorkspaceConfiguration } from 'coc.nvim';

export class Config {
  private static readonly rootSection = 'docthis';
  private cfg: WorkspaceConfiguration;

  constructor() {
    this.cfg = workspace.getConfiguration(Config.rootSection);
  }

  get includeTypes() {
    return this.cfg.get('includeTypes') as boolean;
  }

  get inferTypesFromNames() {
    return this.cfg.get('inferTypesFromNames') as boolean;
  }

  get includeDescriptionTag() {
    return this.cfg.get('includeDescriptionTag') as boolean;
  }

  get includeAuthorTag() {
    return this.cfg.get('includeAuthorTag') as boolean;
  }

  get authorName() {
    return this.cfg.get('authorName', '');
  }

  get includeDateTag() {
    return this.cfg.get('includeDateTag') as boolean;
  }

  get includeMemberOfOnClassMembers() {
    return this.cfg.get('includeMemberOfOnClassMembers') as boolean;
  }

  get includeMemberOfOnInterfaceMembers() {
    return this.cfg.get('includeMemberOfOnInterfaceMembers') as boolean;
  }

  get includeExtraLineAfterDescription() {
    return this.cfg.get('includeExtraLineAfterDescription') as boolean;
  }

  get returnsTag() {
    return this.cfg.get('returnsTag') as boolean;
  }

  get enableHungarianNotationEvaluation() {
    return this.cfg.get('enableHungarianNotationEvaluation') as boolean;
  }
}
