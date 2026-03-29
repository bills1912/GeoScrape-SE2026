"""TOON structure generator - create response templates for LLM prompts."""
from typing import Any, Dict, List, Optional, Union
from .constants import (
    COMMA, COLON, NEWLINE,
    DEFAULT_DELIMITER, DEFAULT_INDENT,
    LEFT_BRACKET, RIGHT_BRACKET, LEFT_BRACE, RIGHT_BRACE
)
from .utils import get_indent


def generate_structure(
    schema: Union[Dict[str, Any], List[Dict[str, Any]]], 
    options: Optional[Dict[str, Any]] = None
) -> str:
    """
    Generate a TOON structure template from a schema definition.
    
    This function creates a response structure template that can be included
    in LLM prompts to specify the expected output format without examples.
    
    Args:
        schema: Schema definition as a dict or list of dicts
            - For simple fields: {"field_name": "description"}
            - For nested objects: {"field_name": {"nested_field": "description"}}
            - For arrays: {"field_name": [{"array_field": "description"}]}
            - List at root level creates a tabular array template
        options: Optional encoding options
            - delimiter: ',' (default), '\t', or '|'
            - indent: int (default 2)
            
    Returns:
        TOON formatted structure template string
        
    Examples:
        >>> schema = {
        ...     "name": "name of the person",
        ...     "age": "age of the person",
        ...     "occupation": "job description of the person"
        ... }
        >>> print(generate_structure(schema))
        name: <name of the person>
        age: <age of the person>
        occupation: <job description of the person>
        
        >>> schema = [{"id": "user id", "name": "user name"}]
        >>> print(generate_structure(schema))
        [N]{id,name}:
          <user id>,<user name>
          ...
    """
    if options is None:
        options = {}
    
    delimiter = options.get('delimiter', DEFAULT_DELIMITER)
    indent = options.get('indent', DEFAULT_INDENT)
    
    if isinstance(schema, list):
        return _generate_array_structure(schema, 0, delimiter, indent)
    elif isinstance(schema, dict):
        return _generate_object_structure(schema, 0, delimiter, indent)
    else:
        return "<value>"


def _generate_object_structure(
    schema: Dict[str, Any], 
    level: int, 
    delimiter: str, 
    indent_size: int
) -> str:
    """Generate structure template for an object."""
    if not schema:
        return "{}"
    
    lines = []
    indent = get_indent(level, indent_size)
    
    for key, value in schema.items():
        if isinstance(value, str):
            # Simple field with description
            lines.append(f'{indent}{key}{COLON} <{value}>')
        elif isinstance(value, dict):
            # Nested object
            if not value:
                lines.append(f'{indent}{key}{COLON} {{}}')
            else:
                nested = _generate_object_structure(value, level + 1, delimiter, indent_size)
                lines.append(f'{indent}{key}{COLON}')
                lines.append(nested)
        elif isinstance(value, list):
            # Array field
            if not value:
                lines.append(f'{indent}{key}{COLON} []')
            else:
                array_template = _generate_array_structure(value, level, delimiter, indent_size, key=key)
                lines.append(array_template)
        else:
            lines.append(f'{indent}{key}{COLON} <value>')
    
    return NEWLINE.join(lines)


def _generate_array_structure(
    schema: List[Any], 
    level: int, 
    delimiter: str, 
    indent_size: int,
    key: Optional[str] = None
) -> str:
    """Generate structure template for an array."""
    if not schema:
        return "[]"
    
    indent = get_indent(level, indent_size)
    
    # Check if it's an array of objects (tabular format)
    if isinstance(schema[0], dict):
        return _generate_tabular_array_structure(
            schema[0], level, delimiter, indent_size, key
        )
    elif isinstance(schema[0], str):
        # Array of primitive descriptions
        if key:
            return f'{indent}{key}{COLON} [<{schema[0]}>,...]'
        else:
            return f'[<{schema[0]}>,...]'
    else:
        # Generic array
        if key:
            return f'{indent}{key}{COLON} [...]'
        else:
            return '[...]'


def _generate_tabular_array_structure(
    field_schema: Dict[str, Any],
    level: int,
    delimiter: str,
    indent_size: int,
    key: Optional[str] = None
) -> str:
    """Generate structure template for a tabular array."""
    indent = get_indent(level, indent_size)
    
    # Get field names
    fields = list(field_schema.keys())
    
    # Delimiter indicator for non-comma delimiters
    delimiter_indicator = ''
    if delimiter == '\t':
        delimiter_indicator = '\t'
    elif delimiter == '|':
        delimiter_indicator = '|'
    
    # Header: key[N]{field1,field2,...}: or [N]{field1,field2,...}:
    if key:
        header = f'{indent}{key}[N{delimiter_indicator}]{LEFT_BRACE}{COMMA.join(fields)}{RIGHT_BRACE}{COLON}'
    else:
        header = f'[N{delimiter_indicator}]{LEFT_BRACE}{COMMA.join(fields)}{RIGHT_BRACE}{COLON}'
    
    lines = [header]
    
    # Create a sample row with descriptions
    row_parts = []
    for field, description in field_schema.items():
        if isinstance(description, str):
            row_parts.append(f'<{description}>')
        else:
            row_parts.append('<value>')
    
    row = delimiter.join(row_parts)
    lines.append(f'{indent}  {row}')
    lines.append(f'{indent}  ...')
    
    return NEWLINE.join(lines)


def generate_structure_from_pydantic(
    model_class,
    options: Optional[Dict[str, Any]] = None,
    include_descriptions: bool = True
) -> str:
    """
    Generate a TOON structure template from a Pydantic model class.
    
    This function creates a response structure template from a Pydantic model
    that can be included in LLM prompts.
    
    Args:
        model_class: Pydantic model class (BaseModel subclass)
        options: Optional encoding options
            - delimiter: ',' (default), '\t', or '|'
            - indent: int (default 2)
        include_descriptions: If True, include field descriptions from docstrings
            
    Returns:
        TOON formatted structure template string
        
    Examples:
        >>> from pydantic import BaseModel, Field
        >>> class User(BaseModel):
        ...     id: int = Field(description="user identifier")
        ...     name: str = Field(description="user full name")
        ...     email: str = Field(description="user email address")
        >>> print(generate_structure_from_pydantic(User))
        id: <user identifier>
        name: <user full name>
        email: <user email address>
    """
    try:
        from pydantic import BaseModel
    except ImportError:
        raise ImportError(
            "generate_structure_from_pydantic requires pydantic to be installed. "
            "Please install pydantic to use this feature."
        )
    
    if not issubclass(model_class, BaseModel):
        raise TypeError("model_class must be a Pydantic BaseModel subclass")
    
    schema = _extract_schema_from_pydantic(model_class, include_descriptions)
    return generate_structure(schema, options)


def _extract_schema_from_pydantic(
    model_class,
    include_descriptions: bool
) -> Dict[str, Any]:
    """Extract schema from Pydantic model."""
    try:
        # Pydantic v2
        if hasattr(model_class, 'model_fields'):
            fields = model_class.model_fields
            schema = {}
            
            for field_name, field_info in fields.items():
                if include_descriptions and field_info.description:
                    schema[field_name] = field_info.description
                else:
                    # Use type annotation as description
                    annotation = field_info.annotation
                    type_name = _get_type_name(annotation)
                    schema[field_name] = type_name
            
            return schema
        # Pydantic v1
        elif hasattr(model_class, '__fields__'):
            fields = model_class.__fields__
            schema = {}
            
            for field_name, field_info in fields.items():
                if include_descriptions and field_info.field_info.description:
                    schema[field_name] = field_info.field_info.description
                else:
                    # Use type annotation as description
                    type_name = _get_type_name(field_info.outer_type_)
                    schema[field_name] = type_name
            
            return schema
        else:
            raise ValueError("Unable to extract fields from Pydantic model")
    except Exception as e:
        raise ValueError(f"Error extracting schema from Pydantic model: {e}")


def _get_type_name(annotation) -> str:
    """Get a readable type name from a type annotation."""
    if hasattr(annotation, '__name__'):
        return annotation.__name__.lower()
    
    # Handle typing generics
    type_str = str(annotation)
    
    # Simplify common types
    if 'int' in type_str.lower():
        return 'integer'
    elif 'str' in type_str.lower():
        return 'string'
    elif 'float' in type_str.lower():
        return 'number'
    elif 'bool' in type_str.lower():
        return 'boolean'
    elif 'list' in type_str.lower():
        return 'array'
    elif 'dict' in type_str.lower():
        return 'object'
    else:
        return 'value'
