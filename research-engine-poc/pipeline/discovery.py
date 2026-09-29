# Re-export from dedicated discovery package for backward compatibility
from discovery.scope import DomainScopeFilter
from discovery.classifier import TwoStageClassifier

# Alias for backwards compatibility
class URLClassifier:
    @classmethod
    def classify(cls, url: str, content: str = None, title: str = None):
        return TwoStageClassifier.stage1_classify_url(url)

__all__ = ["DomainScopeFilter", "URLClassifier", "TwoStageClassifier"]
