import { AppValidationException } from '../../../common/errors/application.exception';
import { TemplateEngineService } from './template-engine.service';

describe('TemplateEngineService', () => {
  let service: TemplateEngineService;

  beforeEach(() => {
    service = new TemplateEngineService();
  });

  describe('validateTemplateText', () => {
    it('should validate allowed placeholders without error', () => {
      const text = 'Hi {{contact.firstName}} {{contact.lastName}}, I see you work at {{company.name}} as {{contact.title}}. Website: {{company.website}}, Opp: {{opportunity.title}}, Role: {{recipient.role}}';
      const result = service.validateTemplateText(text);
      expect(result.isValid).toBe(true);
      expect(result.invalidPlaceholders).toHaveLength(0);
      expect(result.hasSenderPlaceholder).toBe(false);
    });

    it('should detect sender.name placeholder', () => {
      const text = 'Best regards,\n{{sender.name}}';
      const result = service.validateTemplateText(text);
      expect(result.isValid).toBe(true);
      expect(result.hasSenderPlaceholder).toBe(true);
    });

    it('should identify unknown placeholders', () => {
      const text = 'Hello {{contact.ssn}} at {{company.taxId}}';
      const result = service.validateTemplateText(text);
      expect(result.isValid).toBe(false);
      expect(result.invalidPlaceholders).toContain('contact.ssn');
      expect(result.invalidPlaceholders).toContain('company.taxId');
    });

    it('should throw AppValidationException if text has invalid placeholders', () => {
      expect(() => {
        service.assertValidPlaceholders('Hello {{invalid.token}}');
      }).toThrow(AppValidationException);
    });
  });

  describe('validateTemplateSequences', () => {
    it('should succeed when steps match 0..maxFollowUps contiguously', () => {
      const steps = [{ sequence: 0 }, { sequence: 1 }, { sequence: 2 }];
      expect(() => {
        service.validateTemplateSequences(steps, 2);
      }).not.toThrow();
    });

    it('should throw when sequence identity is missing an intermediate step', () => {
      // 2 steps, but sequences are 0 and 2. Missing sequence 1!
      const steps = [{ sequence: 0 }, { sequence: 2 }];
      expect(() => {
        service.validateTemplateSequences(steps, 2);
      }).toThrow(AppValidationException);
      expect(() => {
        service.validateTemplateSequences(steps, 2);
      }).toThrow(/missing required sequence 1/i);
    });

    it('should throw when sequence 0 is missing', () => {
      const steps = [{ sequence: 1 }, { sequence: 2 }];
      expect(() => {
        service.validateTemplateSequences(steps, 1);
      }).toThrow(/missing required sequence 0/i);
    });
  });

  describe('validateTemplateForCampaign', () => {
    it('should reject template with {{sender.name}} for campaigns', () => {
      const template = {
        id: 't-1',
        name: 'Campaign Outreach',
        isArchived: false,
        steps: [
          { sequence: 0, subjectTemplate: 'Hi', bodyTemplate: 'From {{sender.name}}' },
        ],
      };
      expect(() => {
        service.validateTemplateForCampaign(template, 0);
      }).toThrow(/contains {{sender.name}} which is not supported for campaigns/i);
    });

    it('should reject archived template for campaigns', () => {
      const template = {
        id: 't-1',
        name: 'Archived Template',
        isArchived: true,
        steps: [{ sequence: 0, subjectTemplate: 'Hi', bodyTemplate: 'Hello' }],
      };
      expect(() => {
        service.validateTemplateForCampaign(template, 0);
      }).toThrow(/archived/i);
    });
  });

  describe('renderTemplate', () => {
    it('should resolve company.website to websiteUrl, falling back to domain', () => {
      const template = 'Visit {{company.website}}';
      // Case 1: websiteUrl present
      expect(
        service.renderTemplate(template, {
          company: { name: 'Acme', websiteUrl: 'https://acme.com', domain: 'acme.com' },
        }),
      ).toBe('Visit https://acme.com');

      // Case 2: websiteUrl null, domain present
      expect(
        service.renderTemplate(template, {
          company: { name: 'Acme', websiteUrl: null, domain: 'acme.com' },
        }),
      ).toBe('Visit acme.com');

      // Case 3: both null
      expect(
        service.renderTemplate(template, {
          company: { name: 'Acme', websiteUrl: null, domain: null },
        }),
      ).toBe('Visit ');
    });

    it('should resolve opportunity.title to Opportunity.roleTitle', () => {
      const template = 'Regarding the {{opportunity.title}} position';
      expect(
        service.renderTemplate(template, {
          opportunity: { roleTitle: 'Staff Platform Engineer' },
        }),
      ).toBe('Regarding the Staff Platform Engineer position');
    });

    it('should resolve sender.name from sender.fromName', () => {
      const template = 'Best,\n{{sender.name}}';
      expect(
        service.renderTemplate(template, {
          sender: { fromName: 'Alex Mercer' },
        }),
      ).toBe('Best,\nAlex Mercer');
    });

    it('should safely replace missing context tokens with empty string', () => {
      const template = 'Hello {{contact.firstName}}, welcome to {{company.name}}!';
      expect(service.renderTemplate(template, {})).toBe('Hello , welcome to !');
    });
  });
});
